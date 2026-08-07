import { EventEmitter } from "node:events";

export class SecurityEvents extends EventEmitter {
  userDisabled(userId: string): void {
    this.emit("userDisabled", userId);
  }

  onUserDisabled(listener: (userId: string) => void): () => void {
    this.on("userDisabled", listener);
    return () => this.off("userDisabled", listener);
  }

  sessionRevoked(userId: string): void {
    this.emit("sessionRevoked", userId);
  }

  onSessionRevoked(listener: (userId: string) => void): () => void {
    this.on("sessionRevoked", listener);
    return () => this.off("sessionRevoked", listener);
  }

  sessionEnded(userId: string, sessionId: string): void {
    this.emit("sessionEnded", userId, sessionId);
  }

  onSessionEnded(
    listener: (userId: string, sessionId: string) => void,
  ): () => void {
    this.on("sessionEnded", listener);
    return () => this.off("sessionEnded", listener);
  }
}
