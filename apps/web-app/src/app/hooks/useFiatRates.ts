import React from "react";
import { useDeferredOnlineReady } from "../../hooks/useDeferredOnlineReady";
import {
  FIAT_RATES_CACHE_STORAGE_KEY,
  FIAT_RATES_TTL_MS,
} from "../../utils/constants";
import type { FiatRates } from "../../utils/displayAmounts";
import { safeLocalStorageGet, safeLocalStorageSet } from "../../utils/storage";

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

const isFiatRates = (value: unknown): value is FiatRates => {
  const chfPerBtc = readObjectField(value, "chfPerBtc");
  const czkPerBtc = readObjectField(value, "czkPerBtc");
  const eurPerBtc = readObjectField(value, "eurPerBtc");
  const fetchedAtMs = readObjectField(value, "fetchedAtMs");
  const usdPerBtc = readObjectField(value, "usdPerBtc");

  return (
    typeof chfPerBtc === "number" &&
    Number.isFinite(chfPerBtc) &&
    chfPerBtc > 0 &&
    typeof czkPerBtc === "number" &&
    Number.isFinite(czkPerBtc) &&
    czkPerBtc > 0 &&
    typeof eurPerBtc === "number" &&
    Number.isFinite(eurPerBtc) &&
    eurPerBtc > 0 &&
    typeof fetchedAtMs === "number" &&
    Number.isFinite(fetchedAtMs) &&
    fetchedAtMs > 0 &&
    typeof usdPerBtc === "number" &&
    Number.isFinite(usdPerBtc) &&
    usdPerBtc > 0
  );
};

const readCachedFiatRates = (): FiatRates | null => {
  const raw = safeLocalStorageGet(FIAT_RATES_CACHE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isFiatRates(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const isFiatRatesStale = (value: FiatRates | null): boolean => {
  if (!value) return true;
  return Date.now() - value.fetchedAtMs >= FIAT_RATES_TTL_MS;
};

const parseFetchedRates = (value: unknown): FiatRates | null => {
  const data = readObjectField(value, "data");
  const rates = readObjectField(data, "rates");
  const chfRaw = readObjectField(rates, "CHF");
  const czkRaw = readObjectField(rates, "CZK");
  const eurRaw = readObjectField(rates, "EUR");
  const usdRaw = readObjectField(rates, "USD");

  const chf = Number.parseFloat(String(chfRaw ?? ""));
  const czk = Number.parseFloat(String(czkRaw ?? ""));
  const eur = Number.parseFloat(String(eurRaw ?? ""));
  const usd = Number.parseFloat(String(usdRaw ?? ""));

  if (
    !Number.isFinite(chf) ||
    chf <= 0 ||
    !Number.isFinite(czk) ||
    czk <= 0 ||
    !Number.isFinite(eur) ||
    eur <= 0 ||
    !Number.isFinite(usd) ||
    usd <= 0
  ) {
    return null;
  }

  return {
    chfPerBtc: chf,
    czkPerBtc: czk,
    eurPerBtc: eur,
    fetchedAtMs: Date.now(),
    usdPerBtc: usd,
  };
};

const fetchFiatRates = async (
  signal: AbortSignal,
): Promise<FiatRates | null> => {
  const url = new URL("https://api.coinbase.com/v2/exchange-rates");
  url.searchParams.set("currency", "BTC");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) return null;

  const payload: unknown = await response.json();
  return parseFetchedRates(payload);
};

export const useFiatRates = (): FiatRates | null => {
  const canRunNetworkWork = useDeferredOnlineReady();
  const [fiatRates, setFiatRates] = React.useState<FiatRates | null>(() =>
    readCachedFiatRates(),
  );

  React.useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const cached = readCachedFiatRates();
    setFiatRates(cached);

    if (!canRunNetworkWork) {
      return () => {
        cancelled = true;
        activeController?.abort();
      };
    }

    const syncRates = async () => {
      const cached = readCachedFiatRates();
      if (!cancelled) setFiatRates(cached);
      if (!isFiatRatesStale(cached)) return;

      const controller = new AbortController();
      activeController = controller;

      try {
        const next = await fetchFiatRates(controller.signal);
        if (!next || cancelled) return;
        safeLocalStorageSet(FIAT_RATES_CACHE_STORAGE_KEY, JSON.stringify(next));
        setFiatRates(next);
      } catch {
        // ignore rate fetch errors and keep the last cached value
      } finally {
        if (activeController === controller) activeController = null;
      }
    };

    void syncRates();
    const intervalId = window.setInterval(() => {
      void syncRates();
    }, FIAT_RATES_TTL_MS);

    return () => {
      cancelled = true;
      if (activeController) activeController.abort();
      window.clearInterval(intervalId);
    };
  }, [canRunNetworkWork]);

  return fiatRates;
};
