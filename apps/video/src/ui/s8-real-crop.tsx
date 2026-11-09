import { Img } from "remotion";

interface PlateBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RealCropProps {
  src: string;
  box: PlateBox;
  plate: { w: number; h: number };
  width: number;
}

/** A real element lifted out of a capture at full pixel density, so the gold cover can travel between shots. */
export function RealCrop({ src, box, plate, width }: RealCropProps) {
  const k = width / box.w;
  return (
    <div style={{ position: "relative", width, height: box.h * k, overflow: "hidden" }}>
      <Img
        src={src}
        style={{ position: "absolute", left: -box.x * k, top: -box.y * k, width: plate.w * k, height: plate.h * k, maxWidth: "none" }}
      />
    </div>
  );
}
