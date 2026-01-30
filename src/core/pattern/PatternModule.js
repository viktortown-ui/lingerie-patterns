export class PatternModule {
  constructor({ id, name, category, version, schema, draft }) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.version = version;
    this.schema = schema;
    this.draft = draft;
  }
}
