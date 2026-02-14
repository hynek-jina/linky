export type JsonPrimitive = boolean | number | string | null;

export interface JsonRecord {
  [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export type JsonValue = JsonArray | JsonPrimitive | JsonRecord;
