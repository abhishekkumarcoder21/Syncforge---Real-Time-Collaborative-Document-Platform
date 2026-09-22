# SyncForge WebSocket Protocol

## Connection Endpoint

```
GET /ws/documents/{id}?ticket={ticket}
Upgrade: websocket
```

Authentication is performed via a short-lived (30s) ticket acquired via:
```
POST /api/v1/documents/{id}/ws-ticket
```

## Envelope Format

All WebSocket messages are encoded in JSON:
```json
{
  "type": "<message_type>",
  "payload": { ... }
}
```

## Message Types

### 1. `sync_request` (Client -> Server)
Sent immediately after establishing connection or upon reconnecting after an outage.
```json
{
  "type": "sync_request",
  "payload": {}
}
```

### 2. `sync_response` (Server -> Client)
Sent by the server in response to `sync_request`. Contains the full serialized RGA state and snapshot version.
```json
{
  "type": "sync_response",
  "payload": {
    "state": {
      "elements": [
        { "id": { "r": "node-1", "c": 1 }, "ch": 72, "ts": 1 },
        { "id": { "r": "node-1", "c": 2 }, "ch": 101, "ts": 2 }
      ],
      "op_count": 2
    },
    "snapshot_ver": 3
  }
}
```

### 3. `operation` (Bidirectional)
Transmits an edit (insert or delete).
- **Client -> Server**: Client sends local edit.
- **Server -> Client**: Server broadcasts to all other participants in the room.
```json
{
  "type": "operation",
  "payload": {
    "id": { "r": "user-a-tab", "c": 1 },
    "type": 0,
    "parent": { "r": "", "c": 0 },
    "char": 65,
    "ts": 4
  }
}
```

### 4. `ack` (Server -> Client)
Sent by the server to confirm receipt and queuing of an operation.
```json
{
  "type": "ack",
  "payload": {
    "id": { "r": "user-a-tab", "c": 1 }
  }
}
```

### 5. `presence` (Server -> Client)
Broadcast to room participants when a user connects or disconnects.
```json
{
  "type": "presence",
  "payload": [
    { "user_id": "usr_123", "user_name": "Alice", "online": true },
    { "user_id": "usr_456", "user_name": "Bob", "online": true }
  ]
}
```

### 6. `cursor` (Bidirectional)
Throttled cursor position synchronization (100ms throttle).
- **Client -> Server**: `{ "type": "cursor", "payload": 42 }`
- **Server -> Client**:
```json
{
  "type": "cursor",
  "payload": {
    "user_id": "usr_123",
    "user_name": "Alice",
    "position": 42
  }
}
```

### 7. `ping` / `pong` (Bidirectional)
Used for connection liveness and round-trip latency calculation.
```json
{ "type": "ping", "payload": {} }
{ "type": "pong", "payload": {} }
```

### 8. `error` (Server -> Client)
Reports errors (e.g. read-only violation, invalid operation).
```json
{
  "type": "error",
  "payload": { "message": "viewers cannot edit" }
}
```
