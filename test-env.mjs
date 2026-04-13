import "./src/config.ts";
import { config } from "./src/config.ts";
console.log("DATABASE_URL:", config.databaseUrl);
console.log("KYMA_API_KEY:", config.kymaApiKey ? "(set)" : "(empty)");
console.log("KYMA_BASE_URL:", config.kymaBaseUrl);
