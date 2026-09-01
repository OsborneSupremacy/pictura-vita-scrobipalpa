import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { SubjectType, type ApiTimeline, type ApiTimelineInfo } from '../api/types';
import type { DayNumber, Window } from '../layout';
import {
  MAX_DATE_ISO,
  deriveWindow,
  spanNotice,
  spanProblem,
  toDayNumber,
  toIso
} from '../layout';
import { toLayoutEpisode } from '../api/adapter';

interface Props {
  timeline: ApiTimeline;
  today: DayNumber;
  onSaved: (info: ApiTimelineInfo) => void;
  onClose: () => void;
}

interface Draft {
  title: string;
  subtitle: string;
  start: string;
  end: string;
  ongoing: boolean;
  subjectType: number;
  name: string;
  personBirth: string;
  personDeath: string;
  living: boolean;
  personObfuscate: boolean;
  orgName: string;
  orgStart: string;
  orgEnd: string;
  orgOngoing: boolean;
  orgObfuscate: boolean;
}

/** A date input cannot hold the sentinel, so show a blank until a real date is given. */
const forInput = (iso: string) => (iso === MAX_DATE_ISO ? '' : iso);

function toDraft(info: ApiTimelineInfo): Draft {
  const { person, organization, subjectType } = info.timelineSubject;

  return {
    title: info.title,
    subtitle: info.subtitle,
    start: forInput(info.start),
    end: forInput(info.end),
    ongoing: info.ongoing || info.end === MAX_DATE_ISO,
    subjectType,
    name: person.nameParts.join(' '),
    personBirth: forInput(person.birth),
    personDeath: forInput(person.death),
    // Files written before these flags existed carry the sentinel but no flag, so read the
    // sentinel as authoritative. Saving from here writes the pair back consistently.
    living: person.living || person.death === MAX_DATE_ISO,
    personObfuscate: person.obfuscateDates,
    orgName: organization.name,
    orgStart: forInput(organization.start),
    orgEnd: forInput(organization.end),
    orgOngoing: organization.ongoing || organization.end === MAX_DATE_ISO,
    orgObfuscate: organization.obfuscateDates
  };
}

function toTimelineInfo(info: ApiTimelineInfo, draft: Draft): ApiTimelineInfo {
  const { person, organization } = info.timelineSubject;

  return {
    ...info,
    title: draft.title.trim(),
    subtitle: draft.subtitle,
    start: draft.start,
    end: draft.ongoing ? MAX_DATE_ISO : draft.end,
    ongoing: draft.ongoing,
    timelineSubject: {
      subjectType: draft.subjectType,
      person: {
        ...person,
        nameParts: draft.name.trim().split(/\s+/).filter(Boolean),
        birth: draft.personBirth,
        death: draft.living ? MAX_DATE_ISO : draft.personDeath,
        living: draft.living,
        obfuscateDates: draft.personObfuscate
      },
      organization: {
        ...organization,
        name: draft.orgName,
        start: draft.orgStart,
        end: draft.orgOngoing ? MAX_DATE_ISO : draft.orgEnd,
        ongoing: draft.orgOngoing,
        obfuscateDates: draft.orgObfuscate
      }
    }
  };
}

/**
 * The window the timeline would be drawn over, or null while the dates are too incomplete
 * to have one. An ongoing timeline runs to today, exactly as `TimelineView` draws it, so a
 * blank end date does not read as a zero-length span.
 */
function draftWindow(draft: Draft, today: DayNumber): Window | null {
  if (!draft.start) return null;
  if (!draft.ongoing && (!draft.end || draft.end < draft.start)) return null;

  return {
    floor: toDayNumber(draft.start),
    ceiling: draft.ongoing ? today : toDayNumber(draft.end)
  };
}

/**
 * Catches what the server cannot report usefully: a blank date serializes as "" and fails
 * JSON binding with an opaque message, long before any validator sees it.
 */
function problemWith(draft: Draft, today: DayNumber): string | null {
  if (!draft.title.trim()) return 'Give the timeline a title.';
  if (!draft.start) return 'Give the timeline a start date.';
  if (!draft.ongoing && !draft.end) return 'Give an end date, or mark the timeline as ongoing.';
  if (!draft.ongoing && draft.end < draft.start) return 'The end date is before the start date.';

  const range = draftWindow(draft, today);
  const span = range && spanProblem(range.floor, range.ceiling);
  if (span) return span;

  if (draft.subjectType === SubjectType.Person) {
    if (!draft.name.trim()) return 'Give the person a name.';
    if (!draft.personBirth) return 'Give a date of birth.';
    if (!draft.living && !draft.personDeath) return 'Give a date of death, or mark the person as still living.';
    if (!draft.living && draft.personDeath < draft.personBirth) return 'The date of death is before the date of birth.';
    return null;
  }

  if (!draft.orgName.trim()) return 'Give the organization a name.';
  if (!draft.orgStart) return 'Give a founding date.';
  if (!draft.orgOngoing && !draft.orgEnd) return 'Give an end date, or mark the organization as still operating.';
  if (!draft.orgOngoing && draft.orgEnd < draft.orgStart) return 'The end date is before the founding date.';
  return null;
}

export function TimelineInfoDialog({ timeline, today, onSaved, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(timeline.timelineInfo));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // showModal rather than the open attribute: it brings the focus trap, the backdrop and
  // Escape-to-close with it, none of which is worth reimplementing.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const isPerson = draft.subjectType === SubjectType.Person;

  const fitToEpisodes = () => {
    const { floor, ceiling } = deriveWindow(timeline.episodes.map(toLayoutEpisode), today);
    const anyOngoing = timeline.episodes.some(episode => episode.indefinite);

    setDraft(current => ({
      ...current,
      start: toIso(floor),
      end: anyOngoing ? current.end : toIso(ceiling),
      ongoing: anyOngoing
    }));
  };

  const problem = problemWith(draft, today);

  // Held back while something is outright wrong, so the dialog never shows a complaint and
  // an aside at the same time.
  const range = draftWindow(draft, today);
  const notice = !problem && range ? spanNotice(range.floor, range.ceiling) : null;

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);

    const info = toTimelineInfo(timeline.timelineInfo, draft);

    try {
      await api.updateTimelineInfo({ timelineId: timeline.timelineId, timelineInfo: info });
      onSaved(info);
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} className="info-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>Timeline info</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="fields">
          <label>
            Title
            <input value={draft.title} onChange={e => set('title', e.target.value)} />
          </label>

          <label>
            Subtitle
            <input value={draft.subtitle} onChange={e => set('subtitle', e.target.value)} />
          </label>

          <label>
            Starts
            <input type="date" value={draft.start} onChange={e => set('start', e.target.value)} />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.ongoing}
              onChange={e => set('ongoing', e.target.checked)}
            />
            Ongoing (runs to today)
          </label>

          <label>
            Ends
            <input
              type="date"
              value={draft.end}
              disabled={draft.ongoing}
              onChange={e => set('end', e.target.value)}
            />
          </label>

          {/* The bounds decide what is drawn, so there has to be a way to discover the
              range the episodes actually occupy without reading the file. */}
          <button type="button" className="link fit" onClick={fitToEpisodes}>
            Fit to episodes
          </button>
        </div>

        <fieldset className="subject-type">
          <legend>This timeline is about</legend>
          <label>
            <input
              type="radio"
              name="subjectType"
              checked={isPerson}
              onChange={() => set('subjectType', SubjectType.Person)}
            />
            A person
          </label>
          <label>
            <input
              type="radio"
              name="subjectType"
              checked={!isPerson}
              onChange={() => set('subjectType', SubjectType.Organization)}
            />
            An organization
          </label>
        </fieldset>

        {isPerson ? (
          <div className="fields">
            <label>
              Name
              <input value={draft.name} onChange={e => set('name', e.target.value)} />
            </label>

            <label>
              Born
              <input
                type="date"
                value={draft.personBirth}
                onChange={e => set('personBirth', e.target.value)}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={draft.living}
                onChange={e => set('living', e.target.checked)}
              />
              Still living
            </label>

            <label>
              Died
              <input
                type="date"
                value={draft.personDeath}
                disabled={draft.living}
                onChange={e => set('personDeath', e.target.value)}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={draft.personObfuscate}
                onChange={e => set('personObfuscate', e.target.checked)}
              />
              Obfuscate dates when sharing
            </label>
          </div>
        ) : (
          <div className="fields">
            <label>
              Name
              <input value={draft.orgName} onChange={e => set('orgName', e.target.value)} />
            </label>

            <label>
              Founded
              <input
                type="date"
                value={draft.orgStart}
                onChange={e => set('orgStart', e.target.value)}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={draft.orgOngoing}
                onChange={e => set('orgOngoing', e.target.checked)}
              />
              Still operating
            </label>

            <label>
              Ended
              <input
                type="date"
                value={draft.orgEnd}
                disabled={draft.orgOngoing}
                onChange={e => set('orgEnd', e.target.value)}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={draft.orgObfuscate}
                onChange={e => set('orgObfuscate', e.target.checked)}
              />
              Obfuscate dates when sharing
            </label>
          </div>
        )}

        {(error ?? problem) && <p className="bad">{error ?? problem}</p>}

        {notice && <p className="warn">{notice}</p>}

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={saving || problem !== null}
            title={problem ?? undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
