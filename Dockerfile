FROM node:20-alpine
WORKDIR /app
COPY proxy/package.json .
COPY proxy/index.js .
EXPOSE 3131
CMD ["node", "index.js"]
