FROM node:18.14

ARG PORT=80

EXPOSE ${PORT}

WORKDIR /indexer
RUN <<EOF
set -e
mkdir -p packages/contracts
mkdir -p packages/indexer
mkdir -p packages/mint-interface
mkdir -p packages/sdk
EOF
ADD package.json yarn.lock .
ADD packages/contracts/package.json packages/contracts
ADD packages/indexer/package.json packages/indexer/yarn.lock packages/indexer
ADD packages/mint-interface/package.json packages/mint-interface
ADD packages/sdk/package.json packages/sdk
RUN yarn install
ADD . .
RUN yarn build
CMD yarn start
