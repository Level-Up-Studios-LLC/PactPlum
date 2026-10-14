/** "Client, Agency" -> ["Client", "Agency"]. Validation (uniqueness, length) happens on the server. */
export function parseRoleList(text: string): string[] {
  return text
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
}
