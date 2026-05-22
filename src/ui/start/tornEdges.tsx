// Shared SVG clip-path defs for the start-screen torn-paper tiles. Coordinates
// use objectBoundingBox units (0..1) so each tile clips correctly regardless
// of its rendered size. Two variants:
//
//   #torn-edge-primary — portrait-ish, deliberately rougher top + bottom edges
//   #torn-edge-wide    — landscape, used for the right-column secondary tiles
//
// Mount this once near the top of the tree (Root) — multiple consumers reference
// it via `clip-path: url(#torn-edge-primary)`.

export function TornEdgeDefs() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <clipPath id="torn-edge-primary" clipPathUnits="objectBoundingBox">
          <path d="
            M 0.018 0.014
            L 0.082 0.026 L 0.158 0.006 L 0.234 0.022 L 0.310 0.008
            L 0.398 0.020 L 0.470 0.004 L 0.542 0.024 L 0.628 0.008
            L 0.706 0.022 L 0.788 0.006 L 0.864 0.020 L 0.942 0.010
            L 0.988 0.046
            L 0.978 0.126 L 0.992 0.220 L 0.984 0.332 L 0.990 0.454
            L 0.982 0.580 L 0.992 0.704 L 0.978 0.836 L 0.990 0.948
            L 0.952 0.988
            L 0.872 0.972 L 0.798 0.992 L 0.722 0.974 L 0.642 0.990
            L 0.562 0.974 L 0.484 0.992 L 0.404 0.974 L 0.328 0.990
            L 0.246 0.974 L 0.168 0.992 L 0.092 0.976 L 0.034 0.986
            L 0.012 0.948
            L 0.020 0.832 L 0.006 0.708 L 0.018 0.582 L 0.004 0.456
            L 0.014 0.328 L 0.002 0.222 L 0.016 0.110 L 0.008 0.040
            Z
          " />
        </clipPath>

        <clipPath id="torn-edge-wide" clipPathUnits="objectBoundingBox">
          <path d="
            M 0.012 0.024
            L 0.058 0.046 L 0.116 0.010 L 0.182 0.038 L 0.248 0.014
            L 0.318 0.036 L 0.388 0.010 L 0.458 0.034 L 0.528 0.012
            L 0.598 0.036 L 0.668 0.014 L 0.738 0.030 L 0.812 0.010
            L 0.882 0.028 L 0.948 0.012
            L 0.988 0.072
            L 0.978 0.220 L 0.992 0.368 L 0.984 0.524 L 0.992 0.676
            L 0.978 0.836 L 0.988 0.946
            L 0.940 0.984
            L 0.860 0.968 L 0.790 0.988 L 0.718 0.972 L 0.642 0.990
            L 0.570 0.972 L 0.498 0.990 L 0.426 0.970 L 0.354 0.988
            L 0.280 0.972 L 0.210 0.990 L 0.140 0.974 L 0.068 0.988
            L 0.018 0.954
            L 0.008 0.812 L 0.022 0.652 L 0.006 0.494 L 0.020 0.336
            L 0.006 0.196 L 0.018 0.080
            Z
          " />
        </clipPath>
      </defs>
    </svg>
  );
}
