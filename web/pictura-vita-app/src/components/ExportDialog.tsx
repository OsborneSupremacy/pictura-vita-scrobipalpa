import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildLayout,
  Confidentiality,
  type LayoutCategory,
  type LayoutEpisode,
  type ResolvedConfidentiality,
  type Window
} from '../layout';
import { CategoryIcon } from '../icons/CategoryIcon';
import { collectThumbnails } from '../export/images';
import {
  AUDIENCE_LABELS,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_WIDTHS,
  exportFileName,
  headerMeta,
  layoutWidthFor,
  visibleEpisodeCount,
  type ExportOptions
} from '../export/options';
import { canvasMeasurer, rasterize, saveBlob, svgBlob } from '../export/raster';
import { renderTimelineSvg, type ExportHeader } from '../export/svg';

interface Props {
  timelineId: string;
  title: string;
  subtitle: string;
  episodes: LayoutEpisode[];
  categories: LayoutCategory[];
  /** The whole timeline, for the "whole timeline" range. */
  bounds: Window;
  /** What is on screen now, which the export opens on. */
  current: Window;
  /** Inherited from the toolbar's filter rather than asked a second time. */
  hiddenCategoryIds: ReadonlySet<string>;
  availableImages: readonly string[];
  onClose: () => void;
}

const AUDIENCES: ResolvedConfidentiality[] = [
  Confidentiality.Public,
  Confidentiality.Friends,
  Confidentiality.OnlyMe
];

/**
 * Exporting the current view as a picture.
 *
 * The dialog asks about the four things that genuinely change the file — who it is for, how
 * much of the timeline it covers, how wide it is drawn, and what it carries — and about
 * nothing the application already knows. The category filter is inherited from the toolbar;
 * the file name follows the same dated pattern as the JSON backup.
 *
 * The audience opens on Public rather than on whatever is on screen. See
 * `DEFAULT_EXPORT_OPTIONS` for why: this is the one control where the wrong answer leaves
 * the machine.
 */
export function ExportDialog({
  timelineId,
  title,
  subtitle,
  episodes,
  categories,
  bounds,
  current,
  hiddenCategoryIds,
  availableImages,
  onClose
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  // Measured against the same font stack the export asks for, so a label is cut where the
  // browser would actually run out of room rather than where an estimate guessed.
  const measure = useMemo(() => canvasMeasurer(), []);

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOptions(previous => ({ ...previous, [key]: value }));

  const window = options.range === 'whole' ? bounds : current;

  const visibleCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .map(category => category.categoryId)
          .filter(id => !hiddenCategoryIds.has(id))
      ),
    [categories, hiddenCategoryIds]
  );

  // Turning thumbnails off is expressed as "no image is available", which is the same
  // signal a missing file gives: the layout then never reserves room for one, so a bar
  // without a picture is laid out as if it never had one rather than left with a gap.
  const availableImageNames = useMemo(
    () => (options.thumbnails ? new Set(availableImages) : new Set<string>()),
    [availableImages, options.thumbnails]
  );

  const layout = useMemo(
    () =>
      buildLayout({
        episodes,
        categories,
        floor: window.floor,
        ceiling: window.ceiling,
        totalWidth: layoutWidthFor(options.imageWidth),
        maxConfidentiality: options.audience,
        visibleCategoryIds,
        availableImageNames
      }),
    [
      episodes,
      categories,
      window.floor,
      window.ceiling,
      options.imageWidth,
      options.audience,
      visibleCategoryIds,
      availableImageNames
    ]
  );

  const header = useMemo<ExportHeader | null>(
    () =>
      options.header
        ? { title, subtitle, meta: headerMeta(window, options.audience) }
        : null,
    [options.header, options.audience, title, subtitle, window.floor, window.ceiling]
  );

  const [images, setImages] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!options.thumbnails) {
      setImages(new Map());
      return;
    }

    let cancelled = false;
    void collectThumbnails(timelineId, layout).then(found => {
      if (!cancelled) setImages(found);
    });

    return () => {
      cancelled = true;
    };
  }, [timelineId, layout, options.thumbnails]);

  /**
   * Category icons, serialized once.
   *
   * The renderer is a pure function and cannot call React, so the icons are turned into
   * markup here and handed in. Only the names actually drawn are rendered.
   */
  const icons = useMemo(() => {
    const markup = new Map<string, string>();

    for (const band of layout.bands) {
      if (!band.icon || markup.has(band.icon)) continue;

      const drawn = renderToStaticMarkup(<CategoryIcon name={band.icon} />);
      if (drawn) markup.set(band.icon, drawn);
    }

    return markup;
  }, [layout]);

  const rendered = useMemo(
    () =>
      renderTimelineSvg({
        layout,
        header,
        images,
        icons,
        // An SVG scales on its own; only a raster has to choose a pixel density.
        scale: options.format === 'png' ? options.scale : 1,
        measure
      }),
    [layout, header, images, icons, options.format, options.scale, measure]
  );

  // Redrawn on a timer rather than on every keystroke of the width field: the drawing is
  // cheap, but re-encoding it into an object URL on each render is not.
  useEffect(() => {
    if (layout.isEmpty) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(() => {
      const url = URL.createObjectURL(svgBlob(rendered.markup));
      setPreview(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [rendered, layout.isEmpty]);

  useEffect(() => () => setPreview(previous => (previous && URL.revokeObjectURL(previous), null)), []);

  const counts = useMemo(
    () =>
      new Map(
        AUDIENCES.map(level => [level, visibleEpisodeCount(episodes, categories, level)] as const)
      ),
    [episodes, categories]
  );

  const beyondPublic = (counts.get(options.audience) ?? 0) - (counts.get(Confidentiality.Public) ?? 0);

  const save = async () => {
    setBusy(true);
    setProblem(null);

    try {
      const blob =
        options.format === 'png' ? await rasterize(rendered) : svgBlob(rendered.markup);

      saveBlob(blob, exportFileName(title, window, options.format));
      onClose();
    } catch (failure: unknown) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="info-dialog export-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>Export a picture</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="export-body">
          <div className="fields export-fields">
            <label>
              Audience
              <select
                value={options.audience}
                onChange={event =>
                  set('audience', Number(event.target.value) as ResolvedConfidentiality)
                }
              >
                {AUDIENCES.map(level => (
                  <option key={level} value={level}>
                    {AUDIENCE_LABELS[level]} — {counts.get(level)?.toLocaleString()} episodes
                  </option>
                ))}
              </select>
            </label>

            {/* The one warning worth interrupting for. Everything else about an export can
                be redone; this cannot be taken back out of a file already sent. */}
            {beyondPublic > 0 && (
              <p className="bad export-warning">
                {beyondPublic.toLocaleString()} {beyondPublic === 1 ? 'episode' : 'episodes'} in
                this image {beyondPublic === 1 ? 'is' : 'are'} not public. There is no way to
                filter a picture after it has been sent.
              </p>
            )}

            <label>
              Range
              <select
                value={options.range}
                onChange={event => set('range', event.target.value as ExportOptions['range'])}
              >
                <option value="view">Current view</option>
                <option value="whole">Whole timeline</option>
              </select>
            </label>

            <label>
              Width
              <select
                value={options.imageWidth}
                onChange={event => set('imageWidth', Number(event.target.value))}
              >
                {EXPORT_WIDTHS.map(width => (
                  <option key={width} value={width}>
                    {width.toLocaleString()} px
                  </option>
                ))}
              </select>
            </label>

            {/* Worth stating outright, because it is the one control that behaves unlike
                every other export dialog's. */}
            <p className="muted export-note">
              Width re-lays the timeline out rather than magnifying it, so a wider export
              labels episodes that are too narrow to name at this size.
            </p>

            <label>
              Format
              <select
                value={options.format}
                onChange={event => set('format', event.target.value as ExportOptions['format'])}
              >
                <option value="png">PNG</option>
                <option value="svg">SVG</option>
              </select>
            </label>

            {options.format === 'png' && (
              <label>
                Pixel density
                <select
                  value={options.scale}
                  onChange={event =>
                    set('scale', Number(event.target.value) as ExportOptions['scale'])
                  }
                >
                  <option value={1}>1× — {rendered.cssWidth.toLocaleString()} px wide</option>
                  <option value={2}>2× — {(rendered.cssWidth * 2).toLocaleString()} px wide</option>
                </select>
              </label>
            )}

            <label className="export-toggle">
              <input
                type="checkbox"
                checked={options.thumbnails}
                onChange={event => set('thumbnails', event.target.checked)}
              />
              Include episode pictures
            </label>

            <label className="export-toggle">
              <input
                type="checkbox"
                checked={options.header}
                onChange={event => set('header', event.target.checked)}
              />
              Include the title and date range
            </label>
          </div>

          <div className="export-preview">
            {layout.isEmpty ? (
              <p className="empty">Nothing is visible at this audience and range.</p>
            ) : (
              preview && <img src={preview} alt="Preview of the exported image" />
            )}
          </div>
        </div>

        {problem && <p className="bad">{problem}</p>}

        <footer>
          <span className="muted export-size">
            {rendered.width.toLocaleString()} × {rendered.height.toLocaleString()} px
          </span>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={busy || layout.isEmpty}
          >
            {busy ? 'Drawing…' : `Save ${options.format.toUpperCase()}`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
