export type BotGameKind = "sanguosha" | "gouji" | "doudizhu";

export interface BotDecisionUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface BotDecisionInput<State, Action> {
  readonly roomId: string;
  readonly playerId: string;
  readonly intelligence: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly state: State;
  readonly candidates: readonly Action[];
}

export interface BotDecisionResult {
  /** Index into the candidate array supplied to the provider. */
  readonly candidateIndex: number | null;
  readonly usage: BotDecisionUsage;
}

export interface BotDecisionProvider<State, Action> {
  decide(input: BotDecisionInput<State, Action>): Promise<BotDecisionResult>;
}

/**
 * Game-agnostic registry for optional asynchronous bot brains.
 *
 * Games remain responsible for projecting private state and producing legal
 * candidate actions. Providers can only select a candidate index, so they
 * cannot bypass an authoritative game reducer.
 */
export class BotDecisionRegistry {
  private readonly providers = new Map<
    BotGameKind,
    BotDecisionProvider<unknown, unknown>
  >();

  register<State, Action>(
    game: BotGameKind,
    provider: BotDecisionProvider<State, Action>,
  ): this {
    this.providers.set(game, provider as BotDecisionProvider<unknown, unknown>);
    return this;
  }

  supports(game: BotGameKind): boolean {
    return this.providers.has(game);
  }

  async decide<State, Action>(
    game: BotGameKind,
    input: BotDecisionInput<State, Action>,
  ): Promise<BotDecisionResult | null> {
    const provider = this.providers.get(game);
    if (!provider) return null;
    const result = await provider.decide(
      input as BotDecisionInput<unknown, unknown>,
    );
    if (
      result.candidateIndex !== null &&
      (
        !Number.isSafeInteger(result.candidateIndex) ||
        result.candidateIndex < 0 ||
        result.candidateIndex >= input.candidates.length
      )
    ) {
      return { candidateIndex: null, usage: result.usage };
    }
    return result;
  }
}
