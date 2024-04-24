import tracer from "dd-trace";

import { getServiceName } from "@/config/network";
import { config } from "@/config/index";

if (process.env.DATADOG_AGENT_URL) {
  const service = getServiceName();

  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    clientIpEnabled: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
    env: config.environment,
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });

  for (const disabledDatadogPluginTracing of config.disabledDatadogPluginsTracing) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    tracer.use(disabledDatadogPluginTracing, {
      enabled: false,
    });
  }
}

export default tracer;
