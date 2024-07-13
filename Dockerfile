# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set environment variable to indicate Docker environment
ENV DOCKER_ENV=true

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Copy the audio file into the container
COPY /audio/audio001.mp3 /usr/src/app/audio/audio001.mp3

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Run main.py when the container launches
CMD ["python", "main.py"]
