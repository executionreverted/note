// frontend/svelte/src/lib/types.ts
export interface Block {
  id: string;
  pageId: string;
  parentId?: string;
  type: string;
  content: string;
  metadata: any;
  position: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  version: number;
}

export interface BlockOperation {
  type: 'insert' | 'delete' | 'update';
  position?: number;
  length?: number;
  value?: string;
}
