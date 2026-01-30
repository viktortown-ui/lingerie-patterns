export const Units = {
  mmPerCm: 10,
  mmPerIn: 25.4,
  ptPerIn: 72,
  toMm(value, unit = "cm") {
    if (unit === "mm") return value;
    if (unit === "cm") return value * 10;
    if (unit === "in") return value * 25.4;
    return value;
  },
  fromMm(mm, unit = "cm") {
    if (unit === "mm") return mm;
    if (unit === "cm") return mm / 10;
    if (unit === "in") return mm / 25.4;
    return mm;
  },
  toPtFromMm(mm) {
    return (mm / 25.4) * 72;
  },
};
