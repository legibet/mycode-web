/** Slash command matching for the input area completion menu. */

export interface SlashCommand {
  name: "/new" | "/clear";
  description: string;
  /** Require a second Enter on a confirm row before executing. */
  confirm?: boolean;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "/new", description: "New session" },
  { name: "/clear", description: "Clear conversation", confirm: true },
];

/**
 * Slash menu candidates for the current input. The menu only opens while the
 * whole input is a single slash token ("/", "/c", "/clear"); a "/" anywhere
 * else stays plain text, and unknown commands ("/usr/local") match nothing so
 * they submit as a normal message.
 */
export function matchSlashCommands(input: string): SlashCommand[] {
  if (!/^\/\S*$/.test(input)) return [];
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(input));
}
