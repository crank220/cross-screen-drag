export type MaterialType = 'video' | 'image' | 'pdf' | 'text' | 'website' | 'datasource';
export type FrameRole = 'resource' | 'canvas';

export interface MaterialMeta {
  [key: string]: string | number | undefined;
}

export interface Material {
  id: string;
  type: MaterialType;
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  sourceFile: string;
  meta: MaterialMeta;
}

export interface SceneItem extends Material {
  instanceId: string;
  materialId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  createdAt: number;
}

export interface DragPayload {
  id: string;
  type: MaterialType;
  source: FrameRole;
  material: Material;
  originInstanceId?: string;
}

export interface DragPoint {
  clientX: number;
  clientY: number;
}

export interface FrameBridgeMessage {
  type: 'frame:ready' | 'drag:start' | 'drag:move' | 'drag:end';
  frame: FrameRole;
  payload?: DragPayload;
  point?: DragPoint;
}

export interface HostBridgeMessage {
  type: 'drag:drop' | 'drag:hover' | 'drag:cancel';
  target?: FrameRole | null;
  payload?: DragPayload;
  point?: DragPoint;
}

export type SocketMessage =
  | { type: 'scene:snapshot'; items: SceneItem[] }
  | { type: 'scene:add'; item: SceneItem }
  | { type: 'scene:move'; item: Pick<SceneItem, 'instanceId' | 'x' | 'y'> }
  | { type: 'scene:remove'; instanceId: string; item?: SceneItem | null }
  | { type: 'library:return'; materialId: string; title: string }
  | { type: 'error'; reason: string };
