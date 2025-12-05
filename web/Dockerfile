# Build Stage
FROM node:22-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Serve Stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Install bash and nano for debugging
RUN apk add --no-cache bash nano

# Add alias for ls
RUN echo "alias ls='ls --color=auto'" >> /root/.bashrc

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
