import { Badge, Button, Input } from 'antd';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AuthUser, RoomChatMessage } from '../types';

interface RoomChatProps {
  roomName: string;
  messages: RoomChatMessage[];
  user: AuthUser;
  connected: boolean;
  onSend: (message: string) => Promise<void>;
}

function chatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function RoomChat({
  roomName,
  messages,
  user,
  connected,
  onSend,
}: RoomChatProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [seenCount, setSeenCount] = useState(messages.length);
  const messageListRef = useRef<HTMLDivElement>(null);
  const unreadCount = open ? 0 : Math.max(0, messages.length - seenCount);

  useEffect(() => {
    if (!open) return;
    setSeenCount(messages.length);
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, open]);

  const submit = async () => {
    const message = draft.trim();
    if (!message || sending || !connected) return;
    setSending(true);
    try {
      await onSend(message);
      setDraft('');
    } catch {
      // The parent surface displays the server error without discarding the draft.
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <aside className={`room-chat${open ? ' room-chat--open' : ''}`} aria-label="房间聊天">
      <button
        type="button"
        className="room-chat__toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) setSeenCount(messages.length);
        }}
      >
        <span>
          <strong>ROOM CHAT</strong>
          <small>{open ? roomName : '房间聊天'}</small>
        </span>
        <Badge count={unreadCount} size="small" overflowCount={99}>
          <b>{open ? '收起' : '展开'}</b>
        </Badge>
      </button>

      {open && (
        <>
          <div className="room-chat__messages" ref={messageListRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="room-chat__empty">
                <strong>暂无消息</strong>
                <span>房间内的真人玩家可以在这里交流。</span>
              </div>
            ) : messages.map((message) => (
              <article
                key={message.id}
                className={message.senderId === user.id ? 'room-chat__message room-chat__message--self' : 'room-chat__message'}
              >
                <header>
                  <strong>{message.senderName}</strong>
                  <time dateTime={message.sentAt}>{chatTime(message.sentAt)}</time>
                </header>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          <div className="room-chat__composer">
            <Input.TextArea
              value={draft}
              autoSize={{ minRows: 1, maxRows: 3 }}
              maxLength={200}
              disabled={!connected || sending}
              placeholder={connected ? '输入消息，Enter 发送' : '连接恢复后可发送'}
              aria-label="聊天消息"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              className="primary-ink-button"
              type="primary"
              disabled={!connected || !draft.trim() || sending}
              loading={sending}
              onClick={() => void submit()}
            >
              发送
            </Button>
          </div>
          <p className="room-chat__hint">Enter 发送 · Shift + Enter 换行 · 最多 200 字</p>
        </>
      )}
    </aside>
  );
}
