package com.example.pricecomparer.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

/*----------------------------------------------------------------------------
TODO:Används inte, var tänkt att vara en hemsida först istället för dashboard!
-----------------------------------------------------------------------------*/
@RestController
public class PublicController {

    @Value("${app.baseUrl:http://localhost:3001}")
    private String baseUrl;

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    public String robots() {
        return """
      User-agent: *
      Disallow: /api/
      Disallow: /

      Sitemap: %s/sitemap.xml
      """.formatted(baseUrl);
    }

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String sitemap() {
        return """
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>%s/</loc>
          <changefreq>weekly</changefreq>
          <priority>0.8</priority>
        </url>
      </urlset>
      """.formatted(baseUrl);
    }
}