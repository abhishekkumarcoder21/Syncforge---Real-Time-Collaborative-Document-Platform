package presence

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

const presenceTTL = 60 * time.Second

type UserPresence struct {
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Online   bool   `json:"online"`
}

type Service struct {
	rdb *redis.Client
}

func NewService(rdb *redis.Client) *Service {
	return &Service{rdb: rdb}
}

func presenceKey(documentID string) string {
	return "presence:" + documentID
}

func (s *Service) SetPresence(documentID, userID, userName string) {
	if s == nil || s.rdb == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	data, _ := json.Marshal(UserPresence{UserID: userID, UserName: userName, Online: true})
	s.rdb.HSet(ctx, presenceKey(documentID), userID, string(data))
	s.rdb.Expire(ctx, presenceKey(documentID), presenceTTL)
}

func (s *Service) RemovePresence(documentID, userID string) {
	if s == nil || s.rdb == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	s.rdb.HDel(ctx, presenceKey(documentID), userID)
}

func (s *Service) GetPresence(documentID string) ([]UserPresence, error) {
	if s == nil || s.rdb == nil {
		return []UserPresence{}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := s.rdb.HGetAll(ctx, presenceKey(documentID)).Result()
	if err != nil {
		return nil, err
	}

	users := make([]UserPresence, 0, len(result))
	for _, val := range result {
		var u UserPresence
		if err := json.Unmarshal([]byte(val), &u); err != nil {
			continue
		}
		users = append(users, u)
	}
	return users, nil
}
