FROM debian:bookworm

ENV TZ=America/Sao_Paulo

RUN apt-get update && apt-get -y upgrade
RUN apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 curl gnupg
RUN curl -sL https://deb.nodesource.com/setup_22.x | bash -

# Install Node.js, which now uses the added NodeSource repository
RUN apt-get install -y nodejs

COPY ["package.json", "package-lock.json*", "tsconfig.json", "/app/"]
COPY ["./src/", "./app/src/"]
COPY "Startup.sh" "/Startup.sh"

# Installs and Builds the Application
WORKDIR /app/

RUN npm install -g typescript
RUN npm install -g ts-node @types/node
RUN npm install
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

CMD [ "/bin/bash", "/Startup.sh" ]


