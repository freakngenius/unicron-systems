import "server-only";
import { Client } from "@notionhq/client";
import { requireServerEnv } from "./env";

let _client: Client | null = null;

export function notion(): Client {
  if (_client) return _client;
  _client = new Client({ auth: requireServerEnv("NOTION_API_KEY") });
  return _client;
}

export function productPageId(): string {
  return requireServerEnv("NOTION_PRODUCT_PAGE_ID");
}
