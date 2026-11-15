FROM node:20-alpine

WORKDIR /app

# Cài dependencies production trước để tận dụng Docker layer cache
COPY package*.json ./
RUN npm ci --omit=dev

# Copy mã nguồn backend
COPY src ./src
COPY index.js ./

# Đảm bảo thư mục uploads tồn tại
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "src/server.js"]
