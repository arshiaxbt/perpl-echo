export function jsonSafe(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))
  );
}

export function jsonSafePublic(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (key === "rawJson") return undefined;
      return typeof item === "bigint" ? item.toString() : item;
    })
  );
}
