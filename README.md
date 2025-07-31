# myqueue-sourcegraph

## Sourcegraph Server (NOT NEEDED)

### Run the docker containers

```shell
docker compose up [-d]
```

### Create an admin account (first-time setup)

Go to `http://localhost:7080` and create an admin account

### Setup an access token

- Go to the access token settings (`http://localhost:7080/site-admin/tokens`)
  - Click on the profile menu in the top right
  - "Site admin"
  - "Users & auth" > "Access token"
- "Generate new token"
- Set the description (e.g. "CLI")
- Set the token expiration (e.g. "No expiration")
- Click "Generate token"
- Use this value for `SRC_ACCESS_TOKEN` env vars
  - Update `docker-compose.yaml`
- Restart the docker containers
  - `docker compose down`
  - `docker compose up [-d]`

### Setup the code host (first-time setup)

- Go to the code host settings (`http://localhost:7080/site-admin/external-services`)
  - Click on the profile menu in the top right
  - "Site admin"
  - "Repositories" > "Code host connections"
- "Other code hosts" > "Sourcegrpah CLI Serve-Git"
- Set the URL to `http://cli:3434/`
- Click "Add connection" at the bottom

## TypeScript SCIP

### Install dependencies

```shell
npm install
```

### Index the repo

```shell
npx scip-typescript index --cwd=/opt/code/work/myqueue/apps/myqueue --progress-bar --output=$(pwd)/index.scip
```

### Upload the index to the Sourcegraph server (NOT NEEDED)

```shell
SRC_ACCESS_TOKEN='sgp_local_ba144336ead0ef5b92cf5968ab5bc334ea9688f8'
COMMIT="$(git -C /opt/code/work/myqueue rev-parse HEAD)"
docker run --rm -it --network=sg -v .:/app -e SRC_ENDPOINT=http://server:7080 -e "SRC_ACCESS_TOKEN=$SRC_ACCESS_TOKEN" sourcegraph/src-cli:6.4 code-intel upload -repo=myqueue -root=apps/myqueue -commit="$COMMIT" -file=/app/index.scip
```

### Use the SCIP index

Parse the `index.scip` file or use the debug JSON output:

```shell
npm run scip:get-cli
npm run scip:print-json > index.json
```

## Reference

- [Sourcegraph single-container docker](https://sourcegraph.com/docs/admin/deploy/docker-single-container)
- [scip-typescript](https://github.com/sourcegraph/scip-typescript)
  - [indexing with scip-typescript](https://sourcegraph.com/docs/code-search/code-navigation/how-to/index_a_typescript_and_javascript_repository#one-off-indexing-using-scip-typescript-locally)
- [SCIP CLI](https://github.com/sourcegraph/scip)
  - [Documentation](https://github.com/sourcegraph/scip/blob/main/docs/CLI.md)
