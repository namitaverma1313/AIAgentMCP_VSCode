FROM node:20-bookworm

WORKDIR /app

# Install deps first so this layer is cached across runs unless package*.json changes
COPY package.json package-lock.json ./
RUN npm ci

# Plain Node images don't ship the OS-level libraries Chromium/Firefox/WebKit need
# to run — --with-deps installs those alongside all three browsers so the same
# image works locally and in CI without a separate apt-get step.
RUN npx playwright install --with-deps

# Only what's needed to run the suite: tests hit the deployed site directly
# (see playwright.config.ts baseURL), so frontend/backend source isn't required.
COPY playwright.config.ts ./
COPY tests ./tests

CMD ["npx", "playwright", "test", "--reporter=html,line"]
