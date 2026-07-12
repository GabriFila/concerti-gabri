import "react";

// The UI sets CSS custom properties (e.g. --sn, --nb) via inline styles.
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
