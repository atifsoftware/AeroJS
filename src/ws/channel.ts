/**
 * @file channel.ts
 * @description WebSocket Channel abstractions for AeroJS: Public, Private, and Presence channels.
 */

export abstract class Channel {
  constructor(public readonly name: string) {}

  /**
   * Type of the channel derived from its name prefix.
   */
  public get type(): 'public' | 'private' | 'presence' {
    if (this.name.startsWith('presence-')) return 'presence';
    if (this.name.startsWith('private-')) return 'private';
    return 'public';
  }
}

export class PublicChannel extends Channel {
  // Standard broadcast channel, no auth required
}

export class PrivateChannel extends Channel {
  // Requires authentication/authorization
}

export interface PresenceMember {
  id: string | number;
  info?: any;
}

export class PresenceChannel extends Channel {
  // Requires auth, tracks online users
  // In a multi-node setup, actual member tracking happens via Redis or shared state.
  // The channel class here acts as a representation.
}
