FROM node:carbon-alpine

COPY package*.json ./

RUN npm install

COPY . .

RUN npm link

ENTRYPOINT [ "link-checker" ]


