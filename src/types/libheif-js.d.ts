declare module 'libheif-js/wasm-bundle.js' {
  export interface LibheifDisplayBuffer {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  export interface LibheifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    has_alpha_channel(): boolean;
    display(
      imageData: LibheifDisplayBuffer,
      callback: (displayData: LibheifDisplayBuffer | null) => void,
    ): void;
    free(): void;
  }

  export class HeifDecoder {
    decode(data: ArrayBuffer | Uint8Array): LibheifImage[];
  }

  export interface LibheifBundle {
    HeifDecoder: typeof HeifDecoder;
  }

  const libheif: LibheifBundle;
  export default libheif;
}
