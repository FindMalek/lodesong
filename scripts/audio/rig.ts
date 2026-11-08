import { pingPong, reverb, type Stereo } from "./dsp";

export interface SendRig {
  dry: Stereo;
  verb: Stereo;
  echo: Stereo;
}

export function reverbReturn(rig: SendRig): Stereo {
  const wet = reverb(rig.verb, 2.8, 0.28, 0.02, 2);
  const echo = pingPong(rig.echo, 0.375, 0.45, 0.45);
  const length = rig.dry.l.length;
  const out = { l: new Float32Array(length), r: new Float32Array(length) };
  for (let i = 0; i < length; i += 1) {
    out.l[i] = (rig.dry.l[i] ?? 0) + (wet.l[i] ?? 0) * 0.9 + (echo.l[i] ?? 0) * 0.55;
    out.r[i] = (rig.dry.r[i] ?? 0) + (wet.r[i] ?? 0) * 0.9 + (echo.r[i] ?? 0) * 0.55;
  }
  return out;
}
