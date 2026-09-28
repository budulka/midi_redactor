export interface MediaFormat {
  readonly id: string;
  /** Name shown in messages. */
  readonly label: string;
  /** Lowercase, without the dot. */
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  /** Argument for HTMLMediaElement.canPlayType. */
  readonly probeType: string;
}

export interface NamedFile {
  readonly name: string;
  readonly type: string;
}

/** Lowercase part after the last dot; '' when there is no extension. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Finds the format by extension first (operating systems name the MIME type of the same file
 * differently), then by MIME type for files without a known extension.
 */
export function detectFormat<F extends MediaFormat>(
  formats: readonly F[],
  file: NamedFile,
): F | null {
  const extension = fileExtension(file.name);
  if (extension !== '') {
    const byExtension = formats.find((format) => format.extensions.includes(extension));
    if (byExtension !== undefined) return byExtension;
  }
  const type = file.type.toLowerCase();
  if (type === '') return null;
  return formats.find((format) => format.mimeTypes.includes(type)) ?? null;
}

/** Value of the file input's accept attribute: every extension, then every MIME type. */
export function acceptAttribute(formats: readonly MediaFormat[]): string {
  return [
    ...formats.flatMap((format) => format.extensions.map((ext) => `.${ext}`)),
    ...formats.flatMap((format) => format.mimeTypes),
  ].join(',');
}
