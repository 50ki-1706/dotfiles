/**
 * Serving a whole route set from two adapters.
 *
 * The shim's row replaces the stock `llm-pi-ai` row, so it must serve every
 * route that row served: the shim's own route through
 * {@link IdKeyedPiAiAdapter}, and every other route (mistral, …) through the
 * stock `PiAiAdapter`. This class is that split and nothing else — it exists so
 * the replacement row cannot silently drop a route.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/route-split
 */
/**
 * Route every call to the adapter that owns the requested provider.
 */
export class RouteSplittingAdapter {
    shim;
    stock;
    shimProvider;
    constructor(shim, stock, shimProvider) {
        this.shim = shim;
        this.stock = stock;
        this.shimProvider = shimProvider;
    }
    /** The adapter that owns one route. */
    owner(provider) {
        return provider === this.shimProvider ? this.shim : this.stock;
    }
    providerInfo(provider) {
        return this.owner(provider).providerInfo(provider);
    }
    providerRetryPolicy(provider) {
        return this.owner(provider).providerRetryPolicy(provider);
    }
    imageRequestTarget(provider, model, image) {
        return this.owner(provider).imageRequestTarget(provider, model, image);
    }
    imageRequestPricing(provider, model) {
        return this.owner(provider).imageRequestPricing(provider, model);
    }
    listModels(provider) {
        return this.owner(provider).listModels(provider);
    }
    resolveModel(provider, model, signal) {
        return this.owner(provider).resolveModel(provider, model, signal);
    }
    prepareCall(provider, model, signal) {
        return this.owner(provider).prepareCall(provider, model, signal);
    }
    stream(options) {
        return this.owner(options.provider).stream(options);
    }
}
