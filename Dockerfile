# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set environment variable to indicate Docker environment
ENV DOCKER_ENV=true

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Show the options by default; pass -i to render a file, e.g.
# docker compose run --rm app python main.py -i audio/song.mp3 -o output/song.png
CMD ["python", "main.py", "--help"]
