'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

type MoodKey = 'friday' | 'notFriday';
type SeasonKey = 'winter' | 'spring' | 'summer' | 'autumn';

type MoodManifest = {
  base: string[];
  seasons: Record<SeasonKey, string[]>;
};

interface GalleryManifest {
  generatedAt?: string;
  hemisphereDefault?: 'north' | 'south';
  friday: MoodManifest;
  notFriday: MoodManifest;
}

type Scene = {
  url: string;
  seasonKey: SeasonKey;
  seasonLabel: string;
  galleryCount: number;
  source: 'local-gallery' | 'fallback';
};

type LoadingState = { status: 'loading' };
type ErrorState = { status: 'error'; message: string };
type ReadyState = {
  status: 'ready';
  timezone: string;
  isFriday: boolean;
  localDateIso: string;
  secondsUntilFriday: number;
  weekdayName: string;
  forcedMode: 'friday' | 'no' | null;
  scene: Scene | null;
};

type PageState = LoadingState | ErrorState | ReadyState;

const FALLBACK_IMAGES: Record<MoodKey, string> = {
  friday: '/ai/latest-fiesta.jpg',
  notFriday: '/ai/latest-work.jpg',
};

const SEASON_LABELS: Record<SeasonKey, string> = {
  winter: 'invierno',
  spring: 'primavera',
  summer: 'verano',
  autumn: 'oto\u00f1o',
};

const STATS_ENDPOINT = process.env.NEXT_PUBLIC_STATS_ENDPOINT ?? '';

function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function sendVisitStats(payload: Record<string, unknown>): void {
  if (!STATS_ENDPOINT) {
    return;
  }

  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(STATS_ENDPOINT, blob);
      return;
    }
  } catch (error) {
    console.warn('No fue posible enviar las estadísticas con sendBeacon.', error);
  }

  try {
    fetch(STATS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((error) => {
      console.warn('No fue posible enviar las estadísticas con fetch.', error);
    });
  } catch (error) {
    console.warn('No fue posible enviar las estadísticas.', error);
  }
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveSeasonKey(date: Date, hemisphere: 'north' | 'south'): SeasonKey {
  const month = date.getUTCMonth(); // 0 = enero
  const mappingNorth: SeasonKey[] = [
    'winter',
    'winter',
    'spring',
    'spring',
    'spring',
    'summer',
    'summer',
    'summer',
    'autumn',
    'autumn',
    'autumn',
    'winter',
  ];

  if (hemisphere === 'north') {
    return mappingNorth[month];
  }

  const swap: Record<SeasonKey, SeasonKey> = {
    winter: 'summer',
    summer: 'winter',
    spring: 'autumn',
    autumn: 'spring',
  };

  return swap[mappingNorth[month]];
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return 'menos de un minuto';
  }

  const units = [
    { size: 86400, singular: 'd\u00eda', plural: 'd\u00edas' },
    { size: 3600, singular: 'hora', plural: 'horas' },
    { size: 60, singular: 'minuto', plural: 'minutos' },
  ];

  const parts: string[] = [];
  let remaining = totalSeconds;

  for (const unit of units) {
    const value = Math.floor(remaining / unit.size);
    if (value > 0) {
      parts.push(`${value} ${value === 1 ? unit.singular : unit.plural}`);
      remaining -= value * unit.size;
    }

    if (parts.length === 2) {
      break;
    }
  }

  if (parts.length === 0) {
    return 'menos de un minuto';
  }

  return parts.join(' y ');
}

function formatLocalDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

async function detectTimezone(): Promise<string> {
  const fallback = resolveLocalTimezone();

  try {
    const response = await fetch('https://ipapi.co/timezone/');
    if (!response.ok) {
      throw new Error(`timezone lookup failed with status ${response.status}`);
    }

    const text = (await response.text()).trim();
    return text || fallback;
  } catch (error) {
    console.warn('No fue posible obtener la zona horaria desde la IP.', error);
    return fallback;
  }
}

function getZonedDate(timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(new Date());
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return new Date(
    Date.UTC(
      lookup('year'),
      lookup('month') - 1,
      lookup('day'),
      lookup('hour'),
      lookup('minute'),
      lookup('second'),
    ),
  );
}

export default function HomePage(): JSX.Element {
  const [manifest, setManifest] = useState<GalleryManifest | null>(null);
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const lastLoggedVisitRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch('/ai/gallery-manifest.json', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`manifest request failed with status ${response.status}`);
        }

        const data = (await response.json()) as GalleryManifest;
        if (!cancelled) {
          setManifest(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('No se pudo cargar la galer\u00eda.', error);
          setState({
            status: 'error',
            message: 'No se pudo cargar la galer\u00eda. Int\u00e9ntalo m\u00e1s tarde.',
          });
        }
      }
    }

    loadManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifest) {
      return;
    }

    let cancelled = false;
    const manifestData = manifest;

    async function computeState() {
      setState({ status: 'loading' });

      const timezone = await detectTimezone();
      if (cancelled) return;

      const zonedNow = getZonedDate(timezone);
      const forceParam =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('force') : null;

      const actualIsFriday = zonedNow.getUTCDay() === 5;
      const isFriday = forceParam === 'friday' ? true : forceParam === 'no' ? false : actualIsFriday;
      const forcedMode = forceParam === 'friday' ? 'friday' : forceParam === 'no' ? 'no' : null;

      const weekdayName = capitalize(
        new Intl.DateTimeFormat('es-ES', { timeZone: timezone, weekday: 'long' }).format(zonedNow),
      );

      const hemisphere = manifestData.hemisphereDefault ?? 'north';
      const seasonKey = resolveSeasonKey(zonedNow, hemisphere);
      const seasonLabel = SEASON_LABELS[seasonKey];

      const moodKey: MoodKey = isFriday ? 'friday' : 'notFriday';
      const moodManifest = manifestData[moodKey];
      const seasonImages = moodManifest.seasons[seasonKey] ?? [];
      const baseImages = moodManifest.base ?? [];
      const pool = seasonImages.length > 0 ? seasonImages : baseImages;
      const fallback = FALLBACK_IMAGES[moodKey];
      const chosenImage = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : fallback;

      const daysUntilFriday = (5 - zonedNow.getUTCDay() + 7) % 7;
      const nextFriday = new Date(
        Date.UTC(zonedNow.getUTCFullYear(), zonedNow.getUTCMonth(), zonedNow.getUTCDate(), 0, 0, 0),
      );
      nextFriday.setUTCDate(nextFriday.getUTCDate() + daysUntilFriday);

      const secondsUntilFriday =
        forcedMode === 'friday'
          ? 0
          : Math.max(0, Math.floor((nextFriday.getTime() - zonedNow.getTime()) / 1000));

      if (cancelled) {
        return;
      }

      setState({
        status: 'ready',
        timezone,
        isFriday,
        localDateIso: zonedNow.toISOString(),
        secondsUntilFriday,
        weekdayName,
        forcedMode,
        scene: {
          url: chosenImage,
          seasonKey,
          seasonLabel,
          galleryCount: pool.length,
          source: pool.length > 0 ? 'local-gallery' : 'fallback',
        },
      });
    }

    computeState();

    return () => {
      cancelled = true;
    };
  }, [manifest]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const fingerprint = [
      state.localDateIso,
      state.timezone,
      state.forcedMode ?? 'auto',
      state.scene?.seasonKey ?? 'unknown',
    ].join('|');

    if (lastLoggedVisitRef.current === fingerprint) {
      return;
    }

    lastLoggedVisitRef.current = fingerprint;

    sendVisitStats({
      timezone: state.timezone,
      isFriday: state.isFriday,
      forcedMode: state.forcedMode,
      season: state.scene?.seasonKey ?? null,
      generatedAt: new Date().toISOString(),
    });
  }, [state, lastLoggedVisitRef]);

  const derived = useMemo(() => {
    const friday = state.status === 'ready' && state.isFriday;

    return {
      friday,
      background: friday
        ? 'from-emerald-900 via-emerald-700 to-slate-900'
        : 'from-slate-950 via-neutral-900 to-black',
      headlineText: friday ? 'text-emerald-500 drop-shadow-[0_0_30px_rgba(52,211,153,0.65)]' : 'text-red-500 drop-shadow-[0_0_20px_rgba(248,113,113,0.4)]',
      primaryText: friday ? 'text-emerald-100' : 'text-neutral-100',
      secondaryText: friday ? 'text-emerald-200/80' : 'text-neutral-300/70',
      badge: friday
        ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/40'
        : 'bg-red-500/10 text-red-200 border border-red-400/40',
      countdownBadge: friday ? 'bg-emerald-400 text-emerald-950' : 'bg-red-500 text-red-50',
    };
  }, [state]);

  const scene = state.status === 'ready' ? state.scene : null;
  const localDateDisplay =
    state.status === 'ready' ? formatLocalDate(state.localDateIso, state.timezone) : '';

  return (
    <main
      className={`relative flex min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-br ${derived.background}`}
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.65),transparent_60%)]" />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 pb-12 pt-16 text-center sm:px-12">
        <header className="mb-10">
          <p className="text-sm uppercase tracking-[0.5em] text-neutral-500 sm:text-base">
            esvierneshoy.com
          </p>
          <h1 className="mt-3 text-4xl font-extrabold uppercase text-neutral-100 drop-shadow sm:text-6xl md:text-7xl">
            {'\u00bfEs viernes hoy?'}
          </h1>
        </header>

        {state.status === 'loading' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="size-20 animate-spin rounded-full border-4 border-neutral-200 border-t-transparent" />
            <p className="text-lg font-medium text-neutral-200">Preguntando a los astros...</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <p className="text-5xl font-black uppercase text-red-500">Ups</p>
            <p className="max-w-md text-balance text-lg text-neutral-200">{state.message}</p>
          </div>
        )}

        {state.status === 'ready' && (
          <div className="flex w-full flex-1 flex-col items-center justify-between gap-10">
            <div className="flex flex-col items-center gap-6">
              <p
                className={`text-balance text-7xl font-black uppercase sm:text-8xl md:text-9xl ${derived.headlineText}`}
              >
                {derived.friday ? '\u00a1S\u00ed!' : '\u00a1No!'}
              </p>
              <div className="flex flex-col items-center gap-2">
                {derived.friday ? (
                  <p className={`text-lg sm:text-xl ${derived.primaryText}`}>
                    {'Hoy es viernes en la zona horaria '}
                    <span className="font-semibold">{state.timezone}</span>.
                  </p>
                ) : (
                  <p className={`text-lg sm:text-xl ${derived.primaryText}`}>
                    {'Hoy no es viernes; es '}
                    <span className="font-semibold">{state.weekdayName}</span>
                    {' en la zona horaria '}
                    <span className="font-semibold">{state.timezone}</span>.
                  </p>
                )}
                {scene?.seasonLabel && (
                  <span className={`rounded-full px-4 py-1 text-xs uppercase tracking-[0.3em] ${derived.badge}`}>
                    {`Temporada ${scene.seasonLabel}`}
                  </span>
                )}
                {state.forcedMode && (
                  <span className={`rounded-full px-4 py-1 text-xs uppercase tracking-[0.3em] ${derived.badge}`}>
                    {`Modo forzado: ${state.forcedMode === 'friday' ? 'viernes' : 'no viernes'}`}
                  </span>
                )}
              </div>
              {localDateDisplay && (
                <p className={`text-sm uppercase tracking-wide ${derived.secondaryText}`}>
                  {localDateDisplay}
                </p>
              )}
              {!derived.friday && (
                <p
                  className={`rounded-full px-6 py-2 text-sm font-medium uppercase tracking-[0.35em] shadow-lg ${derived.countdownBadge}`}
                >
                  {`Falta ${formatCountdown(state.secondsUntilFriday)} para el viernes`}
                </p>
              )}
            </div>
            {scene && (
              <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/40 shadow-2xl">
                <Image
                  src={scene.url}
                  alt={
                    scene.seasonLabel
                      ? `Escena de ${scene.seasonLabel}`
                      : 'Escena generada'
                  }
                  width={1280}
                  height={720}
                  unoptimized={scene.url.startsWith('http')}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
