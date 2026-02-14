import React from "react";

interface UseScannedTextHandlerRefBridgeParams {
  handleScannedText: (rawValue: string) => Promise<void>;
  scannedTextHandlerRef: React.MutableRefObject<
    (rawValue: string) => Promise<void>
  >;
}

export const useScannedTextHandlerRefBridge = ({
  handleScannedText,
  scannedTextHandlerRef,
}: UseScannedTextHandlerRefBridgeParams): void => {
  React.useEffect(() => {
    scannedTextHandlerRef.current = handleScannedText;
  }, [handleScannedText, scannedTextHandlerRef]);
};
