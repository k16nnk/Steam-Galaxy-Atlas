// 毎フレームのスクリーン座標受け渡し (React再レンダを避けるためstore外)
export const screen = { x: 0, y: 0, r: 0, id: 0, visible: false };

// カメラ/ビューポート由来の変換係数 (raycastの最小ピック半径計算に使用)
// pxFactor = tan(fov/2) / (viewportHeight/2) : 距離dで1pxに相当するワールド長 = d * pxFactor
export const view = { pxFactor: 0.002 };
