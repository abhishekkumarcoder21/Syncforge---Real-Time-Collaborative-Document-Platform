package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store provides all database operations. Queries are grouped by domain
// but live in one struct to keep the data layer simple.
type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// --- Users ---

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Store) CreateUser(ctx context.Context, email, password, name string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(ctx,
		`INSERT INTO users (email, password, name) VALUES ($1, $2, $3)
		 RETURNING id, email, name, created_at`, email, password, name,
	).Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(ctx,
		`SELECT id, email, password, name, created_at FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Password, &u.Name, &u.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByID(ctx context.Context, id string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(ctx,
		`SELECT id, email, name, created_at FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

// --- Documents ---

type Document struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	OwnerID   string    `json:"owner_id"`
	OwnerName string    `json:"owner_name,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (s *Store) CreateDocument(ctx context.Context, title, ownerID string) (*Document, error) {
	d := &Document{}
	err := s.db.QueryRow(ctx,
		`INSERT INTO documents (title, owner_id) VALUES ($1, $2)
		 RETURNING id, title, owner_id, created_at, updated_at`, title, ownerID,
	).Scan(&d.ID, &d.Title, &d.OwnerID, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}
	return d, nil
}

func (s *Store) GetDocument(ctx context.Context, id string) (*Document, error) {
	d := &Document{}
	err := s.db.QueryRow(ctx,
		`SELECT d.id, d.title, d.owner_id, u.name, d.created_at, d.updated_at
		 FROM documents d JOIN users u ON d.owner_id = u.id
		 WHERE d.id = $1`, id,
	).Scan(&d.ID, &d.Title, &d.OwnerID, &d.OwnerName, &d.CreatedAt, &d.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}
	return d, nil
}

func (s *Store) ListDocuments(ctx context.Context, userID string) ([]Document, error) {
	rows, err := s.db.Query(ctx,
		`SELECT d.id, d.title, d.owner_id, u.name, d.created_at, d.updated_at
		 FROM documents d
		 JOIN users u ON d.owner_id = u.id
		 WHERE d.owner_id = $1
		    OR d.id IN (SELECT document_id FROM document_members WHERE user_id = $1)
		 ORDER BY d.updated_at DESC`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	defer rows.Close()

	var docs []Document
	for rows.Next() {
		var d Document
		if err := rows.Scan(&d.ID, &d.Title, &d.OwnerID, &d.OwnerName, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		docs = append(docs, d)
	}
	return docs, nil
}

func (s *Store) UpdateDocument(ctx context.Context, id, title string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE documents SET title = $1, updated_at = now() WHERE id = $2`, title, id,
	)
	return err
}

func (s *Store) DeleteDocument(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM documents WHERE id = $1`, id)
	return err
}

func (s *Store) TouchDocument(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `UPDATE documents SET updated_at = now() WHERE id = $1`, id)
	return err
}

// --- Document Members ---

type DocumentMember struct {
	DocumentID string    `json:"document_id"`
	UserID     string    `json:"user_id"`
	UserName   string    `json:"user_name"`
	UserEmail  string    `json:"user_email"`
	Role       string    `json:"role"`
	CreatedAt  time.Time `json:"created_at"`
}

func (s *Store) AddDocumentMember(ctx context.Context, documentID, userID, role string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO document_members (document_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (document_id, user_id) DO UPDATE SET role = $3`,
		documentID, userID, role,
	)
	return err
}

func (s *Store) RemoveDocumentMember(ctx context.Context, documentID, userID string) error {
	_, err := s.db.Exec(ctx,
		`DELETE FROM document_members WHERE document_id = $1 AND user_id = $2`,
		documentID, userID,
	)
	return err
}

func (s *Store) GetDocumentMember(ctx context.Context, documentID, userID string) (*DocumentMember, error) {
	m := &DocumentMember{}
	err := s.db.QueryRow(ctx,
		`SELECT dm.document_id, dm.user_id, u.name, u.email, dm.role, dm.created_at
		 FROM document_members dm JOIN users u ON dm.user_id = u.id
		 WHERE dm.document_id = $1 AND dm.user_id = $2`, documentID, userID,
	).Scan(&m.DocumentID, &m.UserID, &m.UserName, &m.UserEmail, &m.Role, &m.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get document member: %w", err)
	}
	return m, nil
}

func (s *Store) ListDocumentMembers(ctx context.Context, documentID string) ([]DocumentMember, error) {
	rows, err := s.db.Query(ctx,
		`SELECT dm.document_id, dm.user_id, u.name, u.email, dm.role, dm.created_at
		 FROM document_members dm JOIN users u ON dm.user_id = u.id
		 WHERE dm.document_id = $1
		 ORDER BY dm.created_at`, documentID,
	)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []DocumentMember
	for rows.Next() {
		var m DocumentMember
		if err := rows.Scan(&m.DocumentID, &m.UserID, &m.UserName, &m.UserEmail, &m.Role, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, m)
	}
	return members, nil
}

// GetUserRole returns the user's role for a document. Owner is checked first.
func (s *Store) GetUserRole(ctx context.Context, documentID, userID string) (string, error) {
	var ownerID string
	err := s.db.QueryRow(ctx, `SELECT owner_id FROM documents WHERE id = $1`, documentID).Scan(&ownerID)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if ownerID == userID {
		return "owner", nil
	}

	var role string
	err = s.db.QueryRow(ctx,
		`SELECT role FROM document_members WHERE document_id = $1 AND user_id = $2`,
		documentID, userID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return role, err
}

// --- Snapshots ---

type Snapshot struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"document_id"`
	Version    int       `json:"version"`
	Content    string    `json:"content"`
	CRDTState  []byte    `json:"-"`
	OpCount    int       `json:"op_count"`
	CreatedBy  *string   `json:"created_by,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

func (s *Store) SaveSnapshot(ctx context.Context, documentID string, version int, content string, crdtState []byte, opCount int, createdBy string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO document_snapshots (document_id, version, content, crdt_state, op_count, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		documentID, version, content, crdtState, opCount, createdBy,
	)
	return err
}

func (s *Store) GetLatestSnapshot(ctx context.Context, documentID string) (*Snapshot, error) {
	snap := &Snapshot{}
	err := s.db.QueryRow(ctx,
		`SELECT id, document_id, version, content, crdt_state, op_count, created_by, created_at
		 FROM document_snapshots WHERE document_id = $1
		 ORDER BY version DESC LIMIT 1`, documentID,
	).Scan(&snap.ID, &snap.DocumentID, &snap.Version, &snap.Content, &snap.CRDTState, &snap.OpCount, &snap.CreatedBy, &snap.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get latest snapshot: %w", err)
	}
	return snap, nil
}

func (s *Store) ListSnapshots(ctx context.Context, documentID string) ([]Snapshot, error) {
	rows, err := s.db.Query(ctx,
		`SELECT s.id, s.document_id, s.version, s.content, s.op_count, s.created_by, s.created_at
		 FROM document_snapshots s WHERE s.document_id = $1
		 ORDER BY s.version DESC`, documentID,
	)
	if err != nil {
		return nil, fmt.Errorf("list snapshots: %w", err)
	}
	defer rows.Close()

	var snaps []Snapshot
	for rows.Next() {
		var snap Snapshot
		if err := rows.Scan(&snap.ID, &snap.DocumentID, &snap.Version, &snap.Content, &snap.OpCount, &snap.CreatedBy, &snap.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan snapshot: %w", err)
		}
		snaps = append(snaps, snap)
	}
	return snaps, nil
}

func (s *Store) GetSnapshot(ctx context.Context, documentID string, version int) (*Snapshot, error) {
	snap := &Snapshot{}
	err := s.db.QueryRow(ctx,
		`SELECT id, document_id, version, content, crdt_state, op_count, created_by, created_at
		 FROM document_snapshots WHERE document_id = $1 AND version = $2`, documentID, version,
	).Scan(&snap.ID, &snap.DocumentID, &snap.Version, &snap.Content, &snap.CRDTState, &snap.OpCount, &snap.CreatedBy, &snap.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get snapshot: %w", err)
	}
	return snap, nil
}

// --- Operations ---

func (s *Store) SaveOperations(ctx context.Context, documentID string, afterSnapshot int, ops []OpRecord) error {
	if len(ops) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, op := range ops {
		batch.Queue(
			`INSERT INTO document_operations (document_id, after_snapshot, op_data, op_id_replica, op_id_counter)
			 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
			documentID, afterSnapshot, op.Data, op.ReplicaID, op.Counter,
		)
	}

	br := s.db.SendBatch(ctx, batch)
	defer br.Close()

	for range ops {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("save operation: %w", err)
		}
	}
	return nil
}

type OpRecord struct {
	Data      []byte
	ReplicaID string
	Counter   uint64
}

func (s *Store) GetOperationsAfterSnapshot(ctx context.Context, documentID string, afterSnapshot int) ([][]byte, error) {
	rows, err := s.db.Query(ctx,
		`SELECT op_data FROM document_operations
		 WHERE document_id = $1 AND after_snapshot = $2
		 ORDER BY created_at`, documentID, afterSnapshot,
	)
	if err != nil {
		return nil, fmt.Errorf("get operations: %w", err)
	}
	defer rows.Close()

	var ops [][]byte
	for rows.Next() {
		var data []byte
		if err := rows.Scan(&data); err != nil {
			return nil, fmt.Errorf("scan operation: %w", err)
		}
		ops = append(ops, data)
	}
	return ops, nil
}

// DeleteOperationsBeforeSnapshot removes operation records that are fully captured in a snapshot.
func (s *Store) DeleteOperationsBeforeSnapshot(ctx context.Context, documentID string, snapshotVersion int) error {
	_, err := s.db.Exec(ctx,
		`DELETE FROM document_operations WHERE document_id = $1 AND after_snapshot < $2`,
		documentID, snapshotVersion,
	)
	return err
}
