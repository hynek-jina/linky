/** Bad invocation rather than a wallet failure; the caller prints usage. */
export class UsageError extends Error {}

export interface ParsedArgs {
  readonly command: string | undefined;
  readonly operands: ReadonlyArray<string>;
  readonly options: Readonly<Record<string, string | undefined>>;
  readonly flags: ReadonlySet<string>;
}

const VALUE_OPTIONS = new Set(["data-dir", "mint"]);
const FLAGS = new Set(["verbose", "help"]);

export const parseArgs = (argv: ReadonlyArray<string>): ParsedArgs => {
  const operands: string[] = [];
  const options: Record<string, string> = {};
  const flags = new Set<string>();

  let index = 0;
  while (index < argv.length) {
    const argument = argv[index];
    index += 1;
    if (!argument.startsWith("--")) {
      operands.push(argument);
      continue;
    }

    const separator = argument.indexOf("=");
    const name =
      separator === -1 ? argument.slice(2) : argument.slice(2, separator);

    if (FLAGS.has(name)) {
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.has(name))
      throw new UsageError(`unknown option --${name}`);

    const value =
      separator === -1 ? argv[index++] : argument.slice(separator + 1);
    if (value === undefined) throw new UsageError(`--${name} needs a value`);
    options[name] = value;
  }

  return { command: operands[0], operands: operands.slice(1), options, flags };
};
