import { URDecoder } from "@ngraveio/bc-ur";

export interface AnimatedQrDecodeResult {
  accepted: boolean;
  completeText: string | null;
}

export class AnimatedQrDecoder {
  private decoder: URDecoder | null = null;

  reset(): void {
    this.decoder = null;
  }

  receive(rawValue: string): AnimatedQrDecodeResult {
    const raw = String(rawValue ?? "").trim();
    if (!/^ur:/i.test(raw)) {
      return {
        accepted: false,
        completeText: null,
      };
    }

    if (this.decoder === null) {
      this.decoder = new URDecoder();
    }

    try {
      const accepted = this.decoder.receivePart(raw);
      if (!accepted) {
        this.reset();
        return {
          accepted: false,
          completeText: null,
        };
      }

      if (!this.decoder.isComplete()) {
        return {
          accepted: true,
          completeText: null,
        };
      }

      const decoded = new TextDecoder().decode(
        this.decoder.resultUR().decodeCBOR(),
      );
      this.reset();

      const completeText = String(decoded ?? "").trim();
      return {
        accepted: true,
        completeText: completeText || null,
      };
    } catch {
      this.reset();
      return {
        accepted: false,
        completeText: null,
      };
    }
  }
}
