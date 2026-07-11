"use client";

import "swagger-ui-react/swagger-ui.css";
import SwaggerUI from "swagger-ui-react";

export function SwaggerUiClient() {
  return <SwaggerUI url="/api-docs/openapi.json" />;
}
