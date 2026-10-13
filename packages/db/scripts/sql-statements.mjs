// Existing migrations terminate statements at a semicolon followed by newline.
// Preserve trigger bodies as a single SQLite statement, including CASE..END.
export function splitSqlStatements(sql) {
  const fragments = sql.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);
  const statements = [];
  let trigger = [];
  for (const fragment of fragments) {
    if (trigger.length || /\bCREATE\s+TRIGGER\b/i.test(fragment)) {
      trigger.push(fragment);
      if (/^END$/i.test(fragment)) {
        statements.push(trigger.join(';\n'));
        trigger = [];
      }
    } else statements.push(fragment);
  }
  if (trigger.length) throw new Error('Unterminated trigger in migration');
  return statements;
}
