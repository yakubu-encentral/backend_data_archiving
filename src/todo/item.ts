import { ItemService } from "./item.service";

const itemService = new ItemService();

export const archiveItem = itemService.archiveItem();
