export interface ModelListCatalogEntry {
  id: string;
  name: string;
  sizeMb?: number;
  isDefault?: boolean;
}

export interface ModelListItem extends ModelListCatalogEntry {
  downloaded: boolean;
  downloading: boolean;
  active: boolean;
}

export function toModelListItem(
  model: ModelListCatalogEntry,
  activeId: string | undefined,
  downloaded: boolean,
  downloading: boolean,
): ModelListItem {
  return {
    id: model.id,
    name: model.name,
    sizeMb: model.sizeMb,
    isDefault: model.isDefault,
    downloaded,
    downloading,
    active: model.id === activeId && downloaded,
  };
}
