export interface XComment {
  id: string;
  url: string;
  authorUsername: string;
  authorDisplayName?: string;
  text: string;
  createdAt?: string;
  parentPostId: string;
  isSelected: boolean;
}

export interface CommentDiscoverySettings {
  maxComments?: number;
  maxScrolls?: number;
  scrollDelayMs?: number;
  noNewCommentsLimit?: number;
  excludedUsernames?: string[];
}

export interface CommentDiscoveryResult {
  postId: string;
  postUrl: string;
  comments: XComment[];
  totalDiscovered: number;
}
