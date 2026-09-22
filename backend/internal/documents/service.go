package documents

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/syncforge/backend/internal/auth"
	"github.com/syncforge/backend/internal/storage"
)

type Service struct {
	store *storage.Store
}

func NewService(store *storage.Store) *Service {
	return &Service{store: store}
}

type createRequest struct {
	Title string `json:"title"`
}

func (s *Service) HandleCreate(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Title = "Untitled"
	}
	if req.Title == "" {
		req.Title = "Untitled"
	}

	doc, err := s.store.CreateDocument(r.Context(), req.Title, userID)
	if err != nil {
		slog.Error("create document", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(doc)
}

func (s *Service) HandleList(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	docs, err := s.store.ListDocuments(r.Context(), userID)
	if err != nil {
		slog.Error("list documents", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if docs == nil {
		docs = []storage.Document{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(docs)
}

func (s *Service) HandleGet(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, err := s.store.GetUserRole(r.Context(), docID, userID)
	if err != nil || role == "" {
		http.Error(w, `{"error":"document not found"}`, http.StatusNotFound)
		return
	}

	doc, err := s.store.GetDocument(r.Context(), docID)
	if err != nil || doc == nil {
		http.Error(w, `{"error":"document not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(doc)
}

type updateRequest struct {
	Title string `json:"title"`
}

func (s *Service) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role != "owner" && role != "editor" {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateDocument(r.Context(), docID, req.Title); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Service) HandleDelete(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role != "owner" {
		http.Error(w, `{"error":"only owner can delete"}`, http.StatusForbidden)
		return
	}

	if err := s.store.DeleteDocument(r.Context(), docID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) HandleListVersions(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role == "" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	snaps, err := s.store.ListSnapshots(r.Context(), docID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if snaps == nil {
		snaps = []storage.Snapshot{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snaps)
}

type restoreRequest struct{}

func (s *Service) HandleRestore(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role != "owner" && role != "editor" {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	// Version restore is implemented as creating a new snapshot from the target version's content.
	// This preserves history — the restore itself becomes a new version.
	// Full implementation requires the sync engine to reload the room state,
	// which will be wired in Phase 11.
	http.Error(w, `{"error":"not yet implemented"}`, http.StatusNotImplemented)
}

func (s *Service) HandleAddMember(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role != "owner" {
		http.Error(w, `{"error":"only owner can add members"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Role != "editor" && req.Role != "viewer" {
		http.Error(w, `{"error":"role must be editor or viewer"}`, http.StatusBadRequest)
		return
	}

	targetUser, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil || targetUser == nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if err := s.store.AddDocumentMember(r.Context(), docID, targetUser.ID, req.Role); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (s *Service) HandleRemoveMember(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role != "owner" {
		http.Error(w, `{"error":"only owner can remove members"}`, http.StatusForbidden)
		return
	}

	if err := s.store.RemoveDocumentMember(r.Context(), docID, targetUserID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) HandleListMembers(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, _ := s.store.GetUserRole(r.Context(), docID, userID)
	if role == "" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	members, err := s.store.ListDocumentMembers(r.Context(), docID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if members == nil {
		members = []storage.DocumentMember{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}
