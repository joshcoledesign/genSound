# Example tracks

Three openly licensed recordings, chosen to look different from one another: a solo
piano, a full orchestra and an electronic track. They are not stored in the repository.
Download them, with checksums verified, by running:

```bash
python examples/fetch_examples.py
```

They are saved to `examples/audio/` (ignored by git). Then, for example:

```bash
python main.py -i examples/audio/macleod-hitman.ogg -o output/hitman.png --size 1000 --pixel-size 2 --fit --layout hilbert
```

## Credits and licenses

| File | Recording | License |
|------|-----------|---------|
| `chopin-nocturne-op9-no2.ogg` | Frédéric Chopin, Nocturne in E-flat major, Op. 9 No. 2, performed by Peter Johnston, via [Musopen](https://musopen.org/music/352/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) ([Commons page](https://commons.wikimedia.org/wiki/File:Chopin_Nocturne_No._2_in_E_Flat_Major,_Op._9.ogg)) |
| `beethoven-symphony-8-finale.ogg` | Ludwig van Beethoven, Symphony No. 8 in F major, Op. 93, iv. Allegro vivace, Musopen recording | Public domain: the work is over 100 years old and Musopen released the recording into the public domain ([Commons page](https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_symphony_no._8_in_f_major,_op._93_-_iv._allegro_vivace.ogg)) |
| `macleod-hitman.ogg` | "Hitman" by Kevin MacLeod ([incompetech.com](https://incompetech.filmmusic.io/song/3880-hitman)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([Commons page](https://commons.wikimedia.org/wiki/File:Hitman_by_Kevin_MacLeod.ogg)) |

"Hitman" requires credit wherever it, or art made from it, is shared:

> "Hitman" by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
