FROM node:22.22

ENV TZ=America/Sao_Paulo

COPY ["package.json", "package-lock.json*", "tsconfig.json", "/app/"]
COPY ["./src/", "./app/src/"]
COPY "Startup.sh" "/Startup.sh"

WORKDIR /app/
RUN npm install -g typescript
RUN npm install -g ts-node
RUN npm install
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

CMD [ "/bin/bash", "/Startup.sh" ]


