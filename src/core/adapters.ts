import { parse as parseYaml } from "yaml"
import { z } from "zod"
import {
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_LAYERS,
  PERMANENCE_VALUES,
  RETRY_BACKOFFS,
  STATE_IMPACTS,
} from "./taxonomy.js"

const AdapterRuleFileSchema = z.object({
  server: z.string().min(1),
  rules: z.array(
    z.object({
      name: z.string().min(1),
      match: z.object({
        status: z.number().int().nullable().default(null),
        message_regex: z.string().nullable().default(null),
      }),
      classify: z.object({
        code: z.enum(ERROR_CODES),
        layer: z.enum(ERROR_LAYERS),
        category: z.enum(ERROR_CATEGORIES),
        permanence: z.enum(PERMANENCE_VALUES),
        retry: z.object({
          safe: z.boolean(),
          after_ms: z.number().int().nonnegative().nullable().default(null),
          max_attempts: z.number().int().nonnegative(),
          backoff: z.enum(RETRY_BACKOFFS).default("none"),
          requires_idempotency_key: z.boolean().default(false),
          same_arguments_required: z.boolean().default(true),
        }),
        state_impact: z.enum(STATE_IMPACTS),
        user_action_required: z.boolean(),
        confidence: z.number().min(0).max(1).default(0.9),
        agent_next_steps: z.array(z.string()).default([]),
        do_not: z.array(z.string()).default([]),
      }),
    }),
  ),
})

type AdapterRuleFile = z.infer<typeof AdapterRuleFileSchema>
type RawAdapterRule = AdapterRuleFile["rules"][number]

export type AdapterRule = {
  readonly server: string
  readonly name: string
  readonly match: {
    readonly status: number | null
    readonly messageRegex: RegExp | null
  }
  readonly classify: RawAdapterRule["classify"]
}

export function parseAdapterRules(content: string): readonly AdapterRule[] {
  const parsed = AdapterRuleFileSchema.parse(parseYaml(content))
  return parsed.rules.map((rule) => ({
    server: parsed.server,
    name: rule.name,
    match: {
      status: rule.match.status,
      messageRegex:
        rule.match.message_regex === null ? null : new RegExp(rule.match.message_regex, "iu"),
    },
    classify: rule.classify,
  }))
}
