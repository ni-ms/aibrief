import { XMLParser, XMLValidator } from "fast-xml-parser";
export const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
});
export const list = (v: any): any[] => (v ? (Array.isArray(v) ? v : [v]) : []);

export { XMLValidator };
