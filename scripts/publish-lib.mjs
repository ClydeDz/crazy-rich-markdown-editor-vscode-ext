// The decisions of the publish workflow. The workflow runs scripts/check-publish.mjs, which uses these functions.

/**
 * The versions of the extension that the Marketplace holds.
 * `vsce show --json` prints `undefined` (and exits with code 0) when the extension does not exist yet.
 */
export function publishedVersions(showOutput) {
  let data;
  try {
    data = JSON.parse(showOutput);
  } catch {
    return [];
  }
  if (!data || !Array.isArray(data.versions)) {
    return [];
  }
  return [...new Set(data.versions.map((entry) => entry.version))];
}

/**
 * Decide if the workflow must publish.
 * `ok` is false when the setup is not complete. The workflow then fails and shows `message`.
 */
export function decidePublish({ publisher, version, published, hasToken }) {
  if (!publisher || publisher === 'local') {
    return {
      publish: false,
      ok: false,
      message: `The publisher in package.json is "${publisher ?? ''}". Set it to the ID of your Marketplace publisher.`,
    };
  }
  if (!hasToken) {
    return {
      publish: false,
      ok: false,
      message: 'The secret VSCE_PAT is not set. Add a Marketplace access token as a repository secret with this name.',
    };
  }
  if (published.includes(version)) {
    return {
      publish: false,
      ok: true,
      message: `Version ${version} is already on the Marketplace. Nothing to publish. To release, raise "version" in package.json.`,
    };
  }
  return { publish: true, ok: true, message: `Version ${version} is new. The workflow publishes it.` };
}
